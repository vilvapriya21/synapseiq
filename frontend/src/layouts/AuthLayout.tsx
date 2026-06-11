import { Outlet } from "react-router-dom";
import styles from "./AuthLayout.module.css";

function AuthLayout() {
  return (
    <main className={styles.shell}>
      <section className={styles.panel}>
        <div className={styles.brand}>
          <span className={styles.logo}>SIQ</span>
          <div>
            <h1>SynapseIQ</h1>
            <p>Enterprise knowledge transfer intelligence</p>
          </div>
        </div>
        <Outlet />
      </section>
    </main>
  );
}

export default AuthLayout;
