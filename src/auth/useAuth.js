import { createContext, useContext } from "react";

// Provided by AuthProvider (AuthProvider.jsx); see there for what it holds.
export const AuthContext = createContext(null);

export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("useAuth must be used inside an AuthProvider.");
  return auth;
}
