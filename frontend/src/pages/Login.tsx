import { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Input } from "../components/common";
import { ROUTES } from "../routes/routePaths";
import { useAuthStore } from "../store/authStore";
import styles from "./PagePlaceholder.module.css";

function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    login(
      { email: "admin@synapseiq.local", id: "local-user", name: "SynapseIQ Admin", roles: ["admin"] },
      { accessToken: "development-token" },
    );
    navigate(ROUTES.dashboard);
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <Input label="Email" name="email" type="email" placeholder="admin@synapseiq.local" />
      <Input label="Password" name="password" type="password" placeholder="Enter password" />
      <Button type="submit">Sign in</Button>
    </form>
  );
}

export default LoginPage;
