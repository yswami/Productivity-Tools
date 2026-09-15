import AVFoundation
import CoreMedia
import Darwin
import Foundation
import ScreenCaptureKit

final class SystemAudioRecorder: NSObject, SCStreamOutput, SCStreamDelegate {
    private let outputURL: URL
    private let statusURL: URL
    private let queue = DispatchQueue(label: "com.yogendra.meetingnotes.system-audio")
    private var stream: SCStream?
    private var writer: AVAssetWriter?
    private var input: AVAssetWriterInput?
    private var startedWriting = false
    private var stopping = false

    init(outputURL: URL) {
        self.outputURL = outputURL
        self.statusURL = URL(fileURLWithPath: outputURL.path + ".status")
        super.init()
    }

    func writeStatus(_ value: String) {
        try? value.write(to: statusURL, atomically: true, encoding: .utf8)
    }

    func start() async throws {
        try? FileManager.default.removeItem(at: outputURL)
        try FileManager.default.createDirectory(
            at: outputURL.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )

        let content = try await SCShareableContent.current
        guard let display = content.displays.first else {
            throw NSError(domain: "SystemAudioRecorder", code: 1, userInfo: [NSLocalizedDescriptionKey: "No display available for ScreenCaptureKit audio capture."])
        }

        let configuration = SCStreamConfiguration()
        configuration.width = 2
        configuration.height = 2
        configuration.minimumFrameInterval = CMTime(value: 1, timescale: 1)
        configuration.capturesAudio = true
        configuration.excludesCurrentProcessAudio = true
        configuration.sampleRate = 48_000
        configuration.channelCount = 2

        let filter = SCContentFilter(display: display, excludingApplications: [], exceptingWindows: [])
        let stream = SCStream(filter: filter, configuration: configuration, delegate: self)
        try stream.addStreamOutput(self, type: .audio, sampleHandlerQueue: queue)
        self.stream = stream

        let writer = try AVAssetWriter(outputURL: outputURL, fileType: .m4a)
        let outputSettings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            AVSampleRateKey: 48_000,
            AVNumberOfChannelsKey: 2,
            AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue
        ]
        let input = AVAssetWriterInput(mediaType: .audio, outputSettings: outputSettings)
        input.expectsMediaDataInRealTime = true
        guard writer.canAdd(input) else {
            throw NSError(domain: "SystemAudioRecorder", code: 2, userInfo: [NSLocalizedDescriptionKey: "Could not add audio input to writer."])
        }
        writer.add(input)
        self.writer = writer
        self.input = input

        try await stream.startCapture()
        writeStatus("ready")
        FileHandle.standardError.write(Data("Recording system audio to \(outputURL.path)\n".utf8))
    }

    func stopAndExit(_ code: Int32) {
        if stopping {
            return
        }
        stopping = true

        Task {
            if let stream {
                try? await stream.stopCapture()
            }

            if startedWriting, let writer, let input {
                input.markAsFinished()
                let finalStatusURL = statusURL
                writer.finishWriting {
                    try? "stopped".write(to: finalStatusURL, atomically: true, encoding: .utf8)
                    FileHandle.standardError.write(Data("System audio recording stopped\n".utf8))
                    exit(code)
                }
            } else {
                writeStatus("stopped-without-audio")
                FileHandle.standardError.write(Data("System audio recording stopped before audio was captured\n".utf8))
                exit(code)
            }
        }
    }

    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .audio else { return }
        guard CMSampleBufferDataIsReady(sampleBuffer) else { return }
        guard let writer, let input else { return }

        let timestamp = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
        if !startedWriting {
            guard writer.startWriting() else {
                FileHandle.standardError.write(Data("Could not start system audio writer: \(writer.error?.localizedDescription ?? "unknown error")\n".utf8))
                return
            }
            writer.startSession(atSourceTime: timestamp)
            startedWriting = true
        }

        if input.isReadyForMoreMediaData {
            input.append(sampleBuffer)
        }
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        FileHandle.standardError.write(Data("System audio stream stopped with error: \(error.localizedDescription)\n".utf8))
        stopAndExit(1)
    }
}

func printUsage() {
    FileHandle.standardError.write(Data("Usage: meeting-notes-system-recorder <output.m4a> [parent-pid] [seconds]\n".utf8))
}

let args = CommandLine.arguments
guard args.count >= 2 && args.count <= 4 else {
    printUsage()
    exit(2)
}

let outputURL = URL(fileURLWithPath: args[1]).standardizedFileURL
let parentPID = args.count >= 3 ? Int32(args[2]) : nil
let stopAfterSeconds = args.count == 4 ? Double(args[3]) : nil
let recorder = SystemAudioRecorder(outputURL: outputURL)

signal(SIGINT, SIG_IGN)
signal(SIGTERM, SIG_IGN)

let sigint = DispatchSource.makeSignalSource(signal: SIGINT, queue: .main)
sigint.setEventHandler {
    recorder.stopAndExit(0)
}
sigint.resume()

let sigterm = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
sigterm.setEventHandler {
    recorder.stopAndExit(0)
}
sigterm.resume()

Task {
    do {
        try await recorder.start()
        if let stopAfterSeconds, stopAfterSeconds > 0 {
            DispatchQueue.main.asyncAfter(deadline: .now() + stopAfterSeconds) {
                recorder.stopAndExit(0)
            }
        }
        if let parentPID, parentPID > 1 {
            Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { _ in
                if kill(parentPID, 0) != 0 {
                    recorder.stopAndExit(0)
                }
            }
        }
    } catch {
        recorder.writeStatus("error: \(error.localizedDescription)")
        FileHandle.standardError.write(Data("Could not start system audio recording: \(error.localizedDescription)\n".utf8))
        exit(1)
    }
}

RunLoop.main.run()
