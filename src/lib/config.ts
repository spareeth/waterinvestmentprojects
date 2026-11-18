// Public, non-secret settings. The platform name ("Water Investment Projects", domain
// waterinvestmentprojects.org, decided 18 Nov) must only ever be read from here, never hard-coded in components.

export const appConfig = {
  name: process.env.APP_NAME || "Water Investment Projects",
  tagline: "Water Investment Summit Project Portal",
  url: process.env.APP_URL || "http://localhost:3000",
  supportEmail: process.env.SUPPORT_EMAIL || undefined,
  developedBy: "Developed by Expo City Dubai, through Terra",
  /**
   * The government uploader's acknowledgement, given once per submission through the upload link (PLAN v0.3
   * section 3). Exact WBG wording (Jacob Kim, 17 Nov). Change the text AND bump the version together: every
   * Submission stores the version that was accepted.
   */
  uploadAcknowledgement: {
    version: "country-upload-ack-v1",
    text: "I confirm, on behalf of the represented Government, consent for the uploaded project teaser to be shared with the participants invited to the Water Investment Summit, through the Water Investment Summit Project Portal.",
  },
} as const;
