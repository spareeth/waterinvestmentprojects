// Public, non-secret settings. The platform name ("Water Investment Projects", domain
// waterinvestmentprojects.org, decided 18 Nov) must only ever be read from here, never hard-coded in components.

export const appConfig = {
  name: process.env.APP_NAME || "Water Investment Projects",
  tagline: "Water Investment Summit Project Portal",
  url: process.env.APP_URL || "http://localhost:3000",
  supportEmail: process.env.SUPPORT_EMAIL || undefined,
  developedBy: "Developed by Expo City Dubai, through Terra",
  /** M6: the event the portal serves, shown on the landing page. The conference is named in text only: no UN
   * Water Conference logo or branding without MoFA approval (PLAN v0.3 0.16). */
  summit: {
    name: "Water Investment Summit",
    date: "9 December 2026",
    conference: "UN Water Conference",
    city: "Abu Dhabi",
  },
  /**
   * M6: partner marks in the landing page footer (PLAN v0.3 0.16: MoFA, a single World Bank Group mark, GCFC,
   * Expo City Dubai/Terra). To swap in a real logo, put the file under public/partners/ and set `logo` to its
   * path and pixel size; until then the page shows a dashed placeholder with the partner's name. Order and
   * entries can change here without touching components.
   */
  partners: [
    { id: "mofa", name: "MoFA" },
    { id: "wbg", name: "World Bank Group" },
    { id: "gcfc", name: "GCFC" },
    { id: "expo-city-dubai", name: "Expo City Dubai" },
  ] as readonly PartnerConfig[],
  /**
   * The government uploader's acknowledgement, given once per submission through the upload link (PLAN v0.3
   * section 3). Exact WBG wording (Jacob Kim, 17 Nov). Change the text AND bump the version together: every
   * Submission stores the version that was accepted.
   */
  uploadAcknowledgement: {
    version: "country-upload-ack-v1",
    text: "I confirm, on behalf of the represented Government, consent for the uploaded project teaser to be shared with the participants invited to the Water Investment Summit, through the Water Investment Summit Project Portal.",
  },
  /**
   * M1: what a Summit or platform admin confirms when uploading a teaser for a country in the portal workspace
   * (an admin cannot consent for a government, only record that its consent was received). Terra wording, to be
   * confirmed with WBG. Stored on the Submission like the uploader's acknowledgement.
   */
  uploadAcknowledgementOnBehalf: {
    version: "country-upload-ack-v1-on-behalf",
    text: "I confirm that the represented Government has given its consent, in writing, for this project teaser to be shared with the participants invited to the Water Investment Summit, through the Water Investment Summit Project Portal.",
  },
  /**
   * M2: the investor or operator acknowledgement, accepted once per user at first sign-in before the pipeline is
   * visible (PLAN v0.3 0.6). WBG will send the wording; until then this is a placeholder. To put in the final text
   * without a code change, set BOTH INVESTOR_ACK_VERSION and INVESTOR_ACK_TEXT (the text alone is ignored, so a
   * new wording always comes with a new version). Users store the version they accepted and are asked again
   * whenever it changes.
   */
  investorAcknowledgement: investorAcknowledgement(),
} as const;

/** A partner shown on the landing page. Without `logo`, a placeholder text mark is shown. */
export type PartnerConfig = {
  id: string;
  /** Visible name of the placeholder, and the logo's alt text. */
  name: string;
  logo?: { src: string; width: number; height: number };
};

function investorAcknowledgement(): {
  version: string;
  text: string;
  isPlaceholder: boolean;
} {
  const version = process.env.INVESTOR_ACK_VERSION?.trim();
  const text = process.env.INVESTOR_ACK_TEXT?.trim();
  if (version && text) return { version, text, isPlaceholder: false };
  return {
    version: "investor-ack-placeholder-v1",
    text: "I confirm that I will use the project teasers and other information shared through this portal only for the purposes of the Water Investment Summit and related bilateral discussions, and that I will not pass them on outside my organisation without the agreement of the country concerned.",
    isPlaceholder: true,
  };
}
