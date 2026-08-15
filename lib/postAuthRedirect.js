// Shared localStorage key for carrying a "take them here once they're
// signed in" intent across the signup -> verify email -> login round
// trip (see app/(auth)/signup/page.js and app/(auth)/login/page.js) -
// signup itself never logs the vendor in, so a "?next=" on /signup alone
// can't survive to the eventual login the way login's own "?next=" does.
export const POST_AUTH_REDIRECT_KEY = "storezn_post_auth_redirect";
