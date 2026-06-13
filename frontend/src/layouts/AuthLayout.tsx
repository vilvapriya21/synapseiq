import { Outlet } from "react-router-dom";
import styles from "./AuthLayout.module.css";

function AuthLayout() {
  return (
    <main className={styles.shell}>
      <Outlet />
    </main>
  );
}

export default AuthLayout;
