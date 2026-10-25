import { useEffect, useRef, useState } from "react";

/** Round avatar (the email's first letter) that opens a menu with the email and Sign out. */
export default function AccountMenu({ email, onSignOut }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const button = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function closeOnOutside(event) {
      if (!root.current?.contains(event.target)) setOpen(false);
    }
    function closeOnEscape(event) {
      if (event.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    }
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const initial = (email || "").trim().charAt(0).toUpperCase() || "?";

  return (
    <div className="st-menu" ref={root}>
      <button
        ref={button}
        type="button"
        className="st-round st-avatar"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={email ? `Account: ${email}` : "Account"}
        title={email}
        onClick={() => setOpen((value) => !value)}
      >
        {initial}
      </button>
      {open && (
        <div className="st-menu-panel" role="menu" aria-label="Account">
          {email && <p className="st-menu-email" title={email}>{email}</p>}
          <button
            type="button"
            role="menuitem"
            className="st-menu-item"
            autoFocus
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
