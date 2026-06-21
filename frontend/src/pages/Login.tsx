import { ChangeEvent, FocusEvent, FormEvent, ReactNode, useEffect, useState } from "react";
import { isAxiosError } from "axios";
import { useNavigate } from "react-router-dom";
import { Button, Input } from "../components/common";
import authKnowledgeImage from "../assets/logo-synapse.jpg";
import { ROUTES } from "../routes/routePaths";
import { authService } from "../services/authService";
import { useAuthStore } from "../store/authStore";
import styles from "./Login.module.css";

type AuthMode = "login" | "signup" | "forgot" | "reset";

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
  if (error instanceof Error) {
    return error.message;
  }
  return "Something went wrong. Please try again.";
}

function requiredLabel(label: string) {
  return (
    <>
      {label} <span className={styles.requiredMark}>*</span>
    </>
  );
}

interface PasswordFieldProps {
  autoComplete: string;
  label: ReactNode;
  name: string;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  onFocus?: (event: FocusEvent<HTMLInputElement>) => void;
  placeholder: string;
  readOnly?: boolean;
  showHint?: boolean;
  value?: string;
}

function PasswordField({
  autoComplete,
  label,
  name,
  onChange,
  onFocus,
  placeholder,
  readOnly = false,
  showHint = false,
  value,
}: PasswordFieldProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className={styles.passwordGroup}>
      <label className={styles.passwordLabel} htmlFor={name}>
        {label}
      </label>
      <div className={styles.passwordShell}>
        <input
          className={styles.passwordInput}
          autoComplete={autoComplete}
          id={name}
          name={name}
          onChange={onChange}
          onFocus={onFocus}
          placeholder={placeholder}
          readOnly={readOnly}
          required
          type={isVisible ? "text" : "password"}
          value={value}
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
  const [mode, setMode] = useState<AuthMode>("login");
  const [emailValue, setEmailValue] = useState("");
  const [passwordValue, setPasswordValue] = useState("");
  const [emailReadOnly, setEmailReadOnly] = useState(true);
  const [passwordReadOnly, setPasswordReadOnly] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const loginUser = useAuthStore((state) => state.login);

  useEffect(() => {
    const clearCredentials = () => {
      setEmailValue("");
      setPasswordValue("");
      setEmailReadOnly(true);
      setPasswordReadOnly(true);
    };
    const timers = [window.setTimeout(clearCredentials, 50), window.setTimeout(clearCredentials, 300)];

    clearCredentials();
    return () => timers.forEach(window.clearTimeout);
  }, [mode]);

  const clearAlerts = () => {
    setError("");
    setMessage("");
  };

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
    const firstName = String(formData.get("first_name") || "").trim();
    const lastName = String(formData.get("last_name") || "").trim();
    const code = String(formData.get("code") || "").trim();
    const confirmPassword = String(formData.get("confirmPassword") || "");

    setError("");
    setMessage("");

    const identityError = validateIdentity(email, mode === "forgot" ? undefined : password);
    if (identityError) {
      setError(identityError);
      return;
    }
    if (mode === "signup" && !firstName) {
      setError("First name is required");
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
        const response = await authService.login(email, password, rememberMe);
        loginUser(
          response.user,
          { accessToken: response.token },
          rememberMe,
        );
        navigate(ROUTES.dashboard, { replace: true });
      }
      if (mode === "signup") {
        const resp = await authService.signup({
          first_name: firstName,
          last_name: lastName || undefined,
          email,
          password,
        });
        setMessage(resp?.message || "Account created. Please sign in.");
        setMode("login");
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
    <div className={styles.authView}>
      <div className={styles.page}>
        <aside className={styles.illustrationPanel}>
          <img
            alt="Knowledge transfer illustration"
            className={styles.illustration}
            src={authKnowledgeImage}
          />
        </aside>

        <section className={styles.card}>
        {mode !== "signup" && (
          <div className={styles.brand}>
            <p>SynapseIQ</p>
            <span>Code Intelligence & Knowledge Transfer</span>
          </div>
        )}
        <h2 className={styles.title}>
          {mode === "login" && "Hello, welcome back"}
          {mode === "signup" && "Create account"}
          {mode === "forgot" && "Recover your password"}
          {mode === "reset" && "Set a new password"}
        </h2>
        <p className={styles.subtitle}>
          {mode === "login" && "Sign in to continue to your dashboard"}
          {mode === "signup" && "Join your SynapseIQ workspace"}
          {mode === "forgot" && "We will generate a verification code for this workspace"}
          {mode === "reset" && "Enter the code and confirm your new password"}
        </p>

        <form autoComplete="off" className={styles.form} onSubmit={handleSubmit}>
          {mode === "signup" && (
            <div className={styles.nameGrid}>
              <Input autoComplete="given-name" className={styles.authInput} label={requiredLabel("First name")} name="first_name" placeholder="First name" required />
              <Input autoComplete="family-name" className={styles.authInput} label="Last name" name="last_name" placeholder="Last name" />
            </div>
          )}
          <Input
            autoComplete="new-password"
            className={styles.authInput}
            label={requiredLabel("Email address")}
            name="email"
            onChange={(event) => setEmailValue(event.target.value)}
            onFocus={() => setEmailReadOnly(false)}
            placeholder="you@company.com"
            readOnly={emailReadOnly}
            required
            type="email"
            value={emailValue}
          />
          {mode === "reset" && <Input autoComplete="one-time-code" className={styles.authInput} label="Verification code" name="code" defaultValue={verificationCode} required />}
          {mode !== "forgot" && (
            <PasswordField
              autoComplete="new-password"
              key={`${mode}-password`}
              label={mode === "reset" ? "New password" : requiredLabel("Password")}
              name="password"
              onChange={(event) => setPasswordValue(event.target.value)}
              onFocus={() => setPasswordReadOnly(false)}
              placeholder="Enter password"
              readOnly={passwordReadOnly}
              showHint={mode === "signup" || mode === "reset"}
              value={passwordValue}
            />
          )}
          {mode === "reset" && (
            <PasswordField autoComplete="new-password" label="Confirm password" name="confirmPassword" placeholder="Confirm password" />
          )}

          {mode === "login" && (
            <div className={styles.row}>
              <label className={styles.remember}>
                <input checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} type="checkbox" />
                Remember me
              </label>
              <button
                className={styles.link}
                onClick={() => {
                  clearAlerts();
                  setMode("forgot");
                }}
                type="button"
              >
                Forgot password?
              </button>
            </div>
          )}

          {error && <div className={styles.error}>{error}</div>}
          {message && <div className={styles.message}>{message}</div>}

          <Button isLoading={isLoading} type="submit">
            {mode === "login" && "Sign In"}
            {mode === "signup" && "Sign Up as Learner"}
            {mode === "forgot" && "Send Verification Code"}
            {mode === "reset" && "Reset Password"}
          </Button>
        </form>

        <p className={styles.footer}>
          {mode === "login" && "New to SynapseIQ? "}
          {mode === "signup" && "Already have an account? "}
          {(mode === "forgot" || mode === "reset") && "Remember your password? "}
          <button
            className={styles.link}
            onClick={() => {
              clearAlerts();
              setMode(mode === "login" ? "signup" : "login");
            }}
            type="button"
          >
            {mode === "login" ? "Create account" : "Sign in"}
          </button>
        </p>
        </section>
      </div>
    </div>
  );
}

export default LoginPage;
