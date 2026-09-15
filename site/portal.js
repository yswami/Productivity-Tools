import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const config = window.BETA_CONFIG || {};
const message = document.querySelector("#message");
const form = document.querySelector("#signup-form");
const downloads = document.querySelector("#downloads");
document.querySelector("#repo-link").href = config.repositoryUrl || "https://github.com";

function setMessage(text, kind = "") {
  message.textContent = text;
  message.className = `message ${kind}`;
}

if (!config.supabaseUrl || !config.supabaseAnonKey) {
  form.querySelector("button").disabled = true;
  setMessage("Beta signup is being configured. Please check back shortly.", "error");
} else {
  const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);
  const { data: { session } } = await supabase.auth.getSession();
  showSession(session);

  supabase.auth.onAuthStateChange((_event, nextSession) => showSession(nextSession));

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = document.querySelector("#email").value.trim();
    setMessage("Sending your secure sign-in link...");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: new URL("./", window.location.href).href,
        data: { beta_terms_version: "2026-09-15", privacy_notice_version: "2026-09-15" }
      }
    });
    setMessage(error ? error.message : "Check your email for the sign-in link.", error ? "error" : "success");
  });

  document.querySelectorAll(".download-button").forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      setMessage("Recording your download request...");
      const { data, error } = await supabase.functions.invoke("issue-download", {
        body: { platform: button.dataset.platform }
      });
      button.disabled = false;
      if (error || !data?.url) {
        setMessage(error?.message || "The build is not available yet.", "error");
        return;
      }
      setMessage("Your download is starting.", "success");
      window.location.assign(data.url);
    });
  });
}

function showSession(session) {
  const signedIn = Boolean(session?.user);
  downloads.hidden = !signedIn;
  form.hidden = signedIn;
  if (signedIn) {
    document.querySelector("#signed-in-email").textContent = session.user.email || "beta tester";
    setMessage("You are signed in and ready to download.", "success");
  }
}
