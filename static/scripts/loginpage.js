// Form validation and submission
document.getElementById("loginForm").addEventListener("submit", function (e) {
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
    setTimeout(() => {
      document.getElementById("successMessage").classList.remove("hidden");
      loginBtn.innerHTML = "Success!";

      // Simulate redirect
      setTimeout(() => {
        alert(
          "Login successful! In a real app, you would be redirected to the dashboard."
        );
        loginBtn.innerHTML = "Sign In";
        loginBtn.disabled = false;
        document.getElementById("successMessage").classList.add("hidden");
      }, 1500);
    }, 1000);
  }
});

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
