import { FormEvent, useState } from "react";
import { isAxiosError } from "axios";
import { useLocation, useNavigate } from "react-router-dom";
import { Button, Input } from "../components/common";
import { ROUTES } from "../routes/routePaths";
import { authService } from "../services/authService";
import { useAuthStore } from "../store/authStore";
import styles from "./Login.module.css";

type AuthMode = "login" | "signup" | "forgot" | "reset";
type Role = "admin" | "sme" | "learner";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const passwordRules =
  "Password must be 8-72 characters and include uppercase, lowercase, and a number.";

function isValidPassword(password: string) {
  return password.length >= 8 && password.length <= 72 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password);
}

function readError(error: unknown) {
  if (isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      return detail
        .map((item) => item?.msg || item?.message)
        .filter(Boolean)
        .join(" ");
    }
    if (error.response?.status === 0 || error.code === "ERR_NETWORK") {
      return "Cannot reach the backend. Make sure FastAPI is running on http://localhost:8000.";
    }
    return `Request failed${error.response?.status ? ` with status ${error.response.status}` : ""}. Please try again.`;
  }
  return "Something went wrong. Please try again.";
}

interface PasswordFieldProps {
  label: string;
  name: string;
  placeholder: string;
  showHint?: boolean;
}

function PasswordField({ label, name, placeholder, showHint = false }: PasswordFieldProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className={styles.passwordGroup}>
      <label className={styles.passwordLabel} htmlFor={name}>
        {label}
      </label>
      <div className={styles.passwordShell}>
        <input
          className={styles.passwordInput}
          id={name}
          name={name}
          placeholder={placeholder}
          type={isVisible ? "text" : "password"}
        />
        <button
          aria-label={isVisible ? "Hide password" : "Show password"}
          className={styles.passwordToggle}
          onClick={() => setIsVisible((current) => !current)}
          title={isVisible ? "Hide password" : "Show password"}
          type="button"
        >
          <svg aria-hidden="true" fill="none" height="20" viewBox="0 0 24 24" width="20">
            <path
              d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            />
            <path
              d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            />
            {isVisible && <path d="M4 20 20 4" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />}
          </svg>
        </button>
      </div>
      {showHint && <p className={styles.passwordHint}>{passwordRules}</p>}
    </div>
  );
}

function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const login = useAuthStore((state) => state.login);
  const [mode, setMode] = useState<AuthMode>("login");
  const [role, setRole] = useState<Role>("admin");
  const [isLoading, setIsLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [verificationCode, setVerificationCode] = useState("");

  const redirectTo = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || ROUTES.dashboard;

  const validateIdentity = (email: string, password?: string) => {
    if (!email) return "Email is required";
    if (!emailPattern.test(email)) return "Enter a valid email address";
    if (password !== undefined && !password) return "Password is required";
    return "";
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");
    const name = String(formData.get("name") || "").trim();
    const code = String(formData.get("code") || "").trim();
    const confirmPassword = String(formData.get("confirmPassword") || "");

    setError("");
    setMessage("");

    const identityError = validateIdentity(email, mode === "forgot" ? undefined : password);
    if (identityError) {
      setError(identityError);
      return;
    }
    if (mode === "signup" && !name) {
      setError("Name is required");
      return;
    }
    if ((mode === "signup" || mode === "reset") && !isValidPassword(password)) {
      setError(passwordRules);
      return;
    }
    if (mode === "reset" && password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setIsLoading(true);
    try {
      if (mode === "login") {
        const response = await authService.login({ email, password });
        login(response.user, { accessToken: response.token }, rememberMe);
        navigate(redirectTo, { replace: true });
      }
      if (mode === "signup") {
        const response = await authService.signup({ email, password, name, role });
        login(response.user, { accessToken: response.token }, rememberMe);
        navigate(ROUTES.dashboard, { replace: true });
      }
      if (mode === "forgot") {
        const response = await authService.forgotPassword({ email });
        setVerificationCode(response.verification_code || "");
        setMessage(response.verification_code ? `Verification code: ${response.verification_code}` : response.message);
        setMode("reset");
      }
      if (mode === "reset") {
        const response = await authService.resetPassword({
          email,
          code,
          password,
          confirm_password: confirmPassword,
        });
        setMessage(response.message);
        setMode("login");
      }
    } catch (requestError) {
      setError(readError(requestError));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.brand}>
        <span className={styles.brandMark}>
          <img alt="" src="/synapse-logo.svg" />
        </span>
        <h1>SynapseIQ</h1>
        <p>Code Intelligence & Knowledge Transfer</p>
      </div>

      <section className={styles.card}>
        <h2 className={styles.title}>
          {mode === "login" && "Welcome back"}
          {mode === "signup" && "Create your workspace account"}
          {mode === "forgot" && "Recover your password"}
          {mode === "reset" && "Set a new password"}
        </h2>
        <p className={styles.subtitle}>
          {mode === "login" && "Sign in to continue to your dashboard"}
          {mode === "signup" && "Sign up first, then access SynapseIQ"}
          {mode === "forgot" && "We will generate a verification code for this workspace"}
          {mode === "reset" && "Enter the code and confirm your new password"}
        </p>

        <form className={styles.form} onSubmit={handleSubmit}>
          {mode === "signup" && <Input label="Full name" name="name" placeholder="Aarav Mehta" />}
          <Input label="Email address" name="email" type="email" placeholder="admin@company.com" />
          {mode === "reset" && <Input label="Verification code" name="code" defaultValue={verificationCode} />}
          {mode !== "forgot" && (
            <PasswordField
              label={mode === "reset" ? "New password" : "Password"}
              name="password"
              placeholder="Enter password"
              showHint={mode === "signup" || mode === "reset"}
            />
          )}
          {mode === "reset" && (
            <PasswordField label="Confirm password" name="confirmPassword" placeholder="Confirm password" />
          )}

          {mode === "signup" && (
            <div className={styles.roleGrid} aria-label="Account role">
              {(["admin", "sme", "learner"] as Role[]).map((item) => (
                <button
                  className={`${styles.roleButton} ${role === item ? styles.roleButtonActive : ""}`}
                  key={item}
                  onClick={() => setRole(item)}
                  type="button"
                >
                  {item === "sme" ? "SME" : item[0].toUpperCase() + item.slice(1)}
                </button>
              ))}
            </div>
          )}

          {mode === "login" && (
            <div className={styles.row}>
              <label className={styles.remember}>
                <input checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} type="checkbox" />
                Remember me
              </label>
              <button className={styles.link} onClick={() => setMode("forgot")} type="button">
                Forgot password?
              </button>
            </div>
          )}

          {error && <div className={styles.error}>{error}</div>}
          {message && <div className={styles.message}>{message}</div>}

          <Button isLoading={isLoading} type="submit">
            {mode === "login" && "Sign In"}
            {mode === "signup" && "Create Account"}
            {mode === "forgot" && "Send Verification Code"}
            {mode === "reset" && "Reset Password"}
          </Button>
        </form>

        <p className={styles.footer}>
          {mode === "login" ? "No account yet? " : "Already have an account? "}
          <button className={styles.link} onClick={() => setMode(mode === "login" ? "signup" : "login")} type="button">
            {mode === "login" ? "Sign up" : "Sign in"}
          </button>
        </p>
      </section>
    </div>
  );
}

export default LoginPage;
