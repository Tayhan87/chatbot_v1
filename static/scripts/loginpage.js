// Form validation and submission
document
  .getElementById("loginForm")
  .addEventListener("submit", async function (e) {
    e.preventDefault();

    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;
    const loginBtn = document.getElementById("loginBtn");

    // Reset error messages
    document
      .querySelectorAll('[id$="Error"]')
      .forEach((el) => el.classList.add("hidden"));

    let isValid = true;

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      document.getElementById("emailError").classList.remove("hidden");
      isValid = false;
    }

    // Password validation
    if (password.length < 6) {
      document.getElementById("passwordError").classList.remove("hidden");
      isValid = false;
    }

    if (isValid) {
      // Show loading state
      loginBtn.innerHTML = `
                    <div class="flex items-center justify-center space-x-2">
                        <div class="w-5 h-5 border-2 border-white border-t-transparent rounded-full loading-spinner"></div>
                        <span>Signing In...</span>
                    </div>
                `;
      loginBtn.disabled = true;

      // Simulate API call
      const flag = await getauth(email, password);
      console.log(flag);

      if (flag) {
        setTimeout(() => {
          document.getElementById("successMessage").classList.remove("hidden");
          loginBtn.innerHTML = "Success!";
          // try {
          //   const baseURL = document.getElementById("googleLoginLink").href;

          //   const seperator = baseURL.includes("?") ? "&" : "?";
          //   const loginURL = `${baseURL}${seperator}login_hint=${encodeURIComponent(
          //     email
          //   )}`;

          //   window.location.href = loginURL;
          // } catch (e) {
          //   console.log(e);
          // }

          // Simulate redirect
          setTimeout(() => {
            try {
              alert(
                "Login successful! In a real app, you would be redirected to the dashboard."
              );
              const baseURL = document.getElementById("googleLoginLink").href;

              const seperator = baseURL.includes("?") ? "&" : "?";
              const loginURL = `${baseURL}${seperator}login_hint=${encodeURIComponent(
                email
              )}&promt=none`;
              console.log(loginURL);
              window.location.href = loginURL;
            } catch (e) {
              console.log(e);
            }
            loginBtn.innerHTML = "Sign In";
            loginBtn.disabled = false;
            document.getElementById("successMessage").classList.add("hidden");
          }, 1500);
        }, 1000);
      } else {
        alert("Invalid Email or Password!!");
        loginBtn.innerHTML = "Sign In";
        loginBtn.disabled = false;
      }
    }
  });

async function getauth(email, password) {
  console.log("Hello world");
  const response = await fetch("/checklogin/", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      email: email,
      password: password,
    }),
  });
  const data = await response.json();
  if (response.ok) {
    console.log(data);
    return true;
  } else {
    console.error(data);
    return false;
  }
}

function signInWithGoogle(event) {
  console.log("Google sign-in initiated");
  const googleBtn = event.currentTarget;
  const originalContent = googleBtn.innerHTML;

  // Show loading state
  googleBtn.innerHTML = `
    <div class="flex items-center justify-center space-x-2">
      <div class="w-5 h-5 border-2 border-[#4FC1E9] border-t-transparent rounded-full loading-spinner"></div>
      <span>Signing in...</span>
    </div>
  `;
  googleBtn.disabled = true;

  // Redirect to Google OAuth
  window.location.href = document.getElementById("googleLoginLink").href;

  // Optional error handling
  setTimeout(() => {
    if (!document.hidden) {
      // If redirect failed
      googleBtn.innerHTML = originalContent;
      googleBtn.disabled = false;
      console.error("Redirect to Google OAuth failed");
    }
  }, 1000);
}

// Forgot password simulation
function showForgotPassword() {
  const email = prompt("Enter your email address to reset your password:");
  if (email) {
    alert("Password reset link sent to " + email + "! Check your inbox.");
  }
}

// Add floating animation to decorative elements
const decorativeElements = document.querySelectorAll(
  ".absolute.w-20, .absolute.w-16"
);
decorativeElements.forEach((el, index) => {
  el.style.animation = `float ${3 + index}s ease-in-out infinite alternate`;
});

// Add floating keyframes
const floatKeyframes = `
            @keyframes float {
                0% { transform: translateY(0px); }
                100% { transform: translateY(-10px); }
            }
        `;
const style = document.createElement("style");
style.textContent = floatKeyframes;
document.head.appendChild(style);

document.addEventListener("DOMContentLoaded", function () {
  const form = document.getElementById("loginForm");
  if (!form) return;

  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const loginBtn = document.getElementById("loginBtn");
  const emailError = document.getElementById("emailError");
  const passwordError = document.getElementById("passwordError");
  const generalLoginError = document.getElementById("generalLoginError");
  const successMessage = document.getElementById("successMessage");

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    // Reset errors
    [emailError, passwordError, generalLoginError].forEach(el => {
      if (el) {
        el.textContent = "";
        el.classList.add("hidden");
      }
    });
    if (successMessage) successMessage.classList.add("hidden");
    loginBtn.disabled = true;
    loginBtn.textContent = "Signing In...";

    // Validate
    let valid = true;
    if (!emailInput.value.trim() || !/^\S+@\S+\.\S+$/.test(emailInput.value)) {
      emailError.textContent = "Valid email is required";
      emailError.classList.remove("hidden");
      valid = false;
    }
    if (!passwordInput.value || passwordInput.value.length < 6) {
      passwordError.textContent = "Password must be at least 6 characters";
      passwordError.classList.remove("hidden");
      valid = false;
    }
    if (!valid) {
      loginBtn.disabled = false;
      loginBtn.textContent = "Sign In";
      return;
    }

    // Send AJAX
    try {
      const response = await fetch("/checklogin/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email: emailInput.value.trim(),
          password: passwordInput.value
        })
      });
      const data = await response.json();
      if (response.ok && data.success) {
        if (successMessage) successMessage.classList.remove("hidden");
        window.location.href = data.redirect_url || "/chatbot/";
      } else {
        if (data.error) {
          generalLoginError.textContent = data.error;
          generalLoginError.classList.remove("hidden");
        } else {
          generalLoginError.textContent = "Login failed. Please try again.";
          generalLoginError.classList.remove("hidden");
        }
      }
    } catch (err) {
      generalLoginError.textContent = "Network or server error.";
      generalLoginError.classList.remove("hidden");
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = "Sign In";
    }
  });
});
