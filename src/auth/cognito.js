// Amazon Cognito's user-pool API, called straight from the browser. These are public
// calls: they carry only the app client id (the client has no secret).
//
// The pool signs people in by email (an alias of a random username) once it is
// verified, and the app client allows the USER_AUTH password flow and refresh tokens.

const AUTHORITY = import.meta.env.VITE_COGNITO_AUTH_URL; // https://cognito-idp.<region>.amazonaws.com/<pool id>
const ENDPOINT = AUTHORITY ? `${new URL(AUTHORITY).origin}/` : null;
const CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID;

const EMAIL_TAKEN = "This email already has an account. Sign in with it below.";

/** Whether a failed sign-up or confirmation means the email belongs to another account. */
export function isEmailTaken(error) {
  return error?.code === "AliasExistsException"
    || (error?.code === "UserLambdaValidationException" && /already exists/i.test(error.message));
}

export const PASSWORD_RULES = "At least 8 characters, with upper and lower case letters, a number and a symbol.";

/** A failed call: `code` is Cognito's exception name, e.g. "NotAuthorizedException". */
export class CognitoError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

async function call(action, body) {
  if (!ENDPOINT || !CLIENT_ID) throw new CognitoError("Config", "Sign-in isn't configured for this site.");
  let response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-amz-json-1.1",
        "X-Amz-Target": `AWSCognitoIdentityProviderService.${action}`,
      },
      body: JSON.stringify({ ClientId: CLIENT_ID, ...body }),
    });
  } catch {
    throw new CognitoError("Network", "Couldn't reach the sign-in service. Check your connection and try again.");
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new CognitoError(String(result.__type || "Unknown").split("#").pop(), result.message || "Something went wrong.");
  }
  return result;
}

/** The claims in a token (no signature check: the API checks tokens; this is for display). */
export function tokenClaims(token) {
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = new TextDecoder().decode(Uint8Array.from(atob(payload), (char) => char.charCodeAt(0)));
    return JSON.parse(json);
  } catch {
    return {};
  }
}

function toSession(result, refreshToken) {
  const tokens = result.AuthenticationResult;
  return {
    accessToken: tokens.AccessToken,
    idToken: tokens.IdToken,
    refreshToken: tokens.RefreshToken ?? refreshToken,
    expiresAt: Date.now() + tokens.ExpiresIn * 1000,
  };
}

/** Signs in with an email (or username) and password; returns a session. */
export async function signIn(username, password) {
  const result = await call("InitiateAuth", {
    AuthFlow: "USER_AUTH",
    AuthParameters: { USERNAME: username, PREFERRED_CHALLENGE: "PASSWORD", PASSWORD: password },
  });
  if (!result.AuthenticationResult) {
    throw new CognitoError(result.ChallengeName || "Challenge", "This account needs a step we don't support yet. Contact support.");
  }
  return toSession(result);
}

/** New tokens from the refresh token (it stays the same). */
export async function refresh(refreshToken) {
  const result = await call("InitiateAuth", {
    AuthFlow: "REFRESH_TOKEN_AUTH",
    AuthParameters: { REFRESH_TOKEN: refreshToken },
  });
  return toSession(result, refreshToken);
}

/**
 * Creates an account. The pool's usernames are separate from emails, so each gets a
 * random one; people only ever use their email. Returns { username, confirmed }.
 */
export async function signUp(email, password) {
  const username = crypto.randomUUID();
  const result = await call("SignUp", {
    Username: username,
    Password: password,
    UserAttributes: [{ Name: "email", Value: email }],
  });
  return { username, confirmed: Boolean(result.UserConfirmed) };
}

export const confirmSignUp = (username, code) => call("ConfirmSignUp", { Username: username, ConfirmationCode: code });
export const resendCode = (username) => call("ResendConfirmationCode", { Username: username });
export const forgotPassword = (email) => call("ForgotPassword", { Username: email });
export const confirmForgotPassword = (email, code, password) => call("ConfirmForgotPassword", {
  Username: email,
  ConfirmationCode: code,
  Password: password,
});
/** Ends the session everywhere it's used: the refresh token and its access tokens stop working. */
export const revoke = (refreshToken) => call("RevokeToken", { Token: refreshToken });

/** What to tell people when a call fails. */
export function friendlyMessage(error) {
  switch (error?.code) {
    case "NotAuthorizedException":
    case "UserNotFoundException":
      return "Incorrect email or password.";
    case "InvalidPasswordException":
      return `That password is too weak. ${PASSWORD_RULES}`;
    case "CodeMismatchException":
      return "That code isn't right. Check the email and try again.";
    case "ExpiredCodeException":
      return "That code has expired. Send a new one and try again.";
    case "AliasExistsException":
      return EMAIL_TAKEN;
    case "UserLambdaValidationException":
      // The pre sign-up check (backend/lambdas/preSignUp.js) refused it.
      return /already exists/i.test(error.message) ? EMAIL_TAKEN : error.message.replace(/^\w+ failed with error /, "");
    case "LimitExceededException":
    case "TooManyRequestsException":
    case "TooManyFailedAttemptsException":
      return "Too many attempts. Please wait a few minutes and try again.";
    case "CodeDeliveryFailureException":
      return "We couldn't send the email. Check the address and try again.";
    case "InvalidParameterException":
      return /email/i.test(error.message) ? "Please enter a valid email address." : error.message;
    default:
      return error?.message || "Something went wrong. Please try again.";
  }
}
