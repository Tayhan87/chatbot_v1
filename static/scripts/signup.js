class SignUpForm {
  constructor() {
    this.form = document.getElementById("signupForm");
    this.nameInput = document.getElementById("name");
    this.emailInput = document.getElementById("email");
    this.passwordInput = document.getElementById("password");
    this.confirmPasswordInput = document.getElementById("confirmPassword");
    this.signupButton = document.getElementById("signupButton");
    this.buttonText = document.getElementById("buttonText");
    this.buttonSpinner = document.getElementById("buttonSpinner");

    this.strengthBar = document.getElementById("strengthBar");
    this.strengthText = document.getElementById("strengthText");

    this.init();
  }

  init() {
    // Form submission
    this.form.addEventListener("submit", (e) => {
      e.preventDefault();
      this.handleSubmit();
    });

    // Real-time validation
    this.nameInput.addEventListener("blur", () => this.validateName());
    this.emailInput.addEventListener("blur", () => this.validateEmail());
    this.passwordInput.addEventListener("input", () => {
      this.checkPasswordStrength();
      this.validatePassword();
    });
    this.confirmPasswordInput.addEventListener("blur", () =>
      this.validateConfirmPassword()
    );

    // Password visibility toggles
    document.getElementById("togglePassword").addEventListener("click", () => {
      this.togglePasswordVisibility("password", "eyeOpen", "eyeClosed");
    });

    document
      .getElementById("toggleConfirmPassword")
      .addEventListener("click", () => {
        this.togglePasswordVisibility(
          "confirmPassword",
          "eyeOpen2",
          "eyeClosed2"
        );
      });
  }

  togglePasswordVisibility(inputId, eyeOpenId, eyeClosedId) {
    const input = document.getElementById(inputId);
    const eyeOpen = document.getElementById(eyeOpenId);
    const eyeClosed = document.getElementById(eyeClosedId);

    if (input.type === "password") {
      input.type = "text";
      eyeOpen.classList.add("hidden");
      eyeClosed.classList.remove("hidden");
    } else {
      input.type = "password";
      eyeOpen.classList.remove("hidden");
      eyeClosed.classList.add("hidden");
    }
  }

  validateName() {
    const name = this.nameInput.value.trim();
    const errorElement = document.getElementById("nameError");

    if (name.length < 2) {
      this.showError(
        this.nameInput,
        errorElement,
        "Name must be at least 2 characters long"
      );
      return false;
    } else if (!/^[a-zA-Z\s]+$/.test(name)) {
      this.showError(
        this.nameInput,
        errorElement,
        "Name can only contain letters and spaces"
      );
      return false;
    } else {
      this.hideError(this.nameInput, errorElement);
      return true;
    }
  }

  validateEmail() {
    const email = this.emailInput.value.trim();
    const errorElement = document.getElementById("emailError");
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
      this.showError(
        this.emailInput,
        errorElement,
        "Please enter a valid email address"
      );
      return false;
    } else {
      this.hideError(this.emailInput, errorElement);
      return true;
    }
  }

  validatePassword() {
    const password = this.passwordInput.value;
    const errorElement = document.getElementById("passwordError");

    if (password.length < 8) {
      this.showError(
        this.passwordInput,
        errorElement,
        "Password must be at least 8 characters long"
      );
      return false;
    } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
      this.showError(
        this.passwordInput,
        errorElement,
        "Password must contain at least one uppercase letter, one lowercase letter, and one number"
      );
      return false;
    } else {
      this.hideError(this.passwordInput, errorElement);
      return true;
    }
  }

  validateConfirmPassword() {
    const password = this.passwordInput.value;
    const confirmPassword = this.confirmPasswordInput.value;
    const errorElement = document.getElementById("confirmPasswordError");

    if (password !== confirmPassword) {
      this.showError(
        this.confirmPasswordInput,
        errorElement,
        "Passwords do not match"
      );
      return false;
    } else {
      this.hideError(this.confirmPasswordInput, errorElement);
      return true;
    }
  }

  checkPasswordStrength() {
    const password = this.passwordInput.value;
    let strength = 0;

    // Length check
    if (password.length >= 8) strength++;
    if (password.length >= 12) strength++;

    // Character variety checks
    if (/[a-z]/.test(password)) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/\d/.test(password)) strength++;
    if (/[^a-zA-Z\d]/.test(password)) strength++;

    // Update strength indicator
    if (password.length === 0) {
      this.strengthBar.style.width = "0%";
      this.strengthText.textContent = "";
      this.strengthBar.className = "password-strength-bar w-full bg-gray-700";
    } else if (strength <= 2) {
      this.strengthBar.style.width = "33%";
      this.strengthText.textContent = "Weak password";
      this.strengthBar.className = "password-strength-bar w-full strength-weak";
    } else if (strength <= 4) {
      this.strengthBar.style.width = "66%";
      this.strengthText.textContent = "Medium strength";
      this.strengthBar.className =
        "password-strength-bar w-full strength-medium";
    } else {
      this.strengthBar.style.width = "100%";
      this.strengthText.textContent = "Strong password";
      this.strengthBar.className =
        "password-strength-bar w-full strength-strong";
    }
  }

  showError(input, errorElement, message) {
    input.classList.add("border-red-500");
    input.classList.add("error-shake");
    errorElement.textContent = message;
    errorElement.classList.remove("hidden");

    setTimeout(() => {
      input.classList.remove("error-shake");
    }, 500);
  }

  hideError(input, errorElement) {
    input.classList.remove("border-red-500");
    errorElement.classList.add("hidden");
  }

  async handleSubmit() {
    // Validate all fields
    const isNameValid = this.validateName();
    const isEmailValid = this.validateEmail();
    const isPasswordValid = this.validatePassword();
    const isConfirmPasswordValid = this.validateConfirmPassword();

    if (
      !isNameValid ||
      !isEmailValid ||
      !isPasswordValid ||
      !isConfirmPasswordValid
    ) {
      return;
    }

    // Show loading state
    this.signupButton.disabled = true;
    this.buttonText.classList.add("hidden");
    this.buttonSpinner.classList.remove("hidden");

    try {
      // Simulate API call - replace with your actual endpoint
      const formData = {
        name: this.nameInput.value.trim(),
        email: this.emailInput.value.trim(),
        password: this.passwordInput.value,
        confirmPassword: this.confirmPasswordInput.value,
      };

      const response = await this.callSignUpAPI(formData);

      // Success animation
      this.form.classList.add("success-pulse");

      // Show success message or redirect
      setTimeout(() => {
        alert("Account created successfully");
        // Redirect to login page or dashboard
        window.location.href = "/login/";
      }, 600);
    } catch (error) {
      if (error.message === "409") {
        alert("Email already exists. Please use a different email.");
      } else {
        console.error("Sign up error:", error.message);
        alert("Sign up failed. Please try again.");
      }
    } finally {
      // Reset button state
      this.signupButton.disabled = false;
      this.buttonText.classList.remove("hidden");
      this.buttonSpinner.classList.add("hidden");
    }
  }

  async callSignUpAPI(formData) {
    // Replace with your actual Django endpoint
    const API_URL = "/signup/";

    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": this.getCSRFToken(),
      },
      body: JSON.stringify(formData),
    });

    if (!response.ok) {
      const errorData = await response.json();
      if (errorData.code === "email_exists") {
        throw new Error(response.status);
      } else {
        throw new Error(
          errorData.message || `HTTP error! status: ${response.status}`
        );
      }
    }

    return await response.json();
  }

  getCSRFToken() {
    const cookieValue = document.cookie
      .split("; ")
      .find((row) => row.startsWith("csrftoken="))
      ?.split("=")[1];

    if (cookieValue) return cookieValue;

    const csrfToken = document.querySelector("[name=csrfmiddlewaretoken]");
    return csrfToken ? csrfToken.value : "";
  }
}

// Initialize the sign up form when page loads
document.addEventListener("DOMContentLoaded", () => {
  new SignUpForm();
});
