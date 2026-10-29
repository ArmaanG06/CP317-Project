import { Outlet } from "react-router-dom";

import PatientNav from "./PatientNav.jsx";

export default function PatientLayout() {
  return (
    <>
      <header>
        <PatientNav />
      </header>
      <main>
        <Outlet />
      </main>
    </>
  );
}
