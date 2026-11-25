// Public, non-secret settings. The platform name ("Water Investment Projects", domain
// waterinvestmentprojects.org, decided 18 Nov) must only ever be read from here, never hard-coded in components.

export const appConfig = {
  name: process.env.APP_NAME || "Water Investment Projects",
  tagline: "Water Investment Summit Project Portal",
  url: process.env.APP_URL || "http://localhost:3000",
  supportEmail: process.env.SUPPORT_EMAIL || undefined,
  /** Footer line on the landing page, sign-in pages, upload link and guide. */
  copyright: "© 2026 Terra, Expo City Dubai",
  /** M6: the event the portal serves, shown on the landing page. The 2026 UN Water Conference logo appears only
   * as a partner mark (PLAN v0.4 0b.27), once its file arrives. */
  summit: {
    name: "Water Investment Summit",
    date: "9 December 2026",
    conference: "UN Water Conference",
    city: "Abu Dhabi",
  },
  /**
   * Partner marks in the landing page hero, "In partnership with" (PLAN v0.4 0b.27: 2026 UN Water Conference,
   * Expo City Dubai / Terra, GCFC, a single World Bank Group mark; no MoFA logo). Order as Sajid set it on
   * 22 Nov; Water Forward (WBG, sent by Jacob Kim) added after the WBG mark on 23 Nov (PLAN 0c.10). On the hero and footer the marks sit on one white
   * band in their original colours (23 Nov); WBG and Water Forward (`colour`) also keep them on light pages. The UN Water
   * Conference mark ("2026 UN Water Conference, Abu Dhabi", dark artwork) was supplied by Sajid on 23 Nov. To add a logo, put the file under public/partners/ and set `logo` to its path, pixel size and
   * artwork ("light" for white artwork, which is turned dark on the white band; "dark" for dark artwork);
   * until then the page shows a dashed placeholder with the partner's name. Order and entries can change here
   * without touching components.
   */
  partners: [
    {
      id: "unwc",
      name: "2026 UN Water Conference",
      logo: {
        src: "/partners/unwc-2026.png",
        width: 1813,
        height: 436,
        artwork: "dark",
      },
    },
    {
      id: "ecd-terra",
      name: "Terra, Expo City Dubai",
      logo: {
        src: "/partners/ecd-terra.png",
        width: 1160,
        height: 205,
        artwork: "light",
      },
    },
    {
      id: "gcfc",
      name: "GCFC",
      logo: {
        src: "/partners/gcfc.png",
        width: 260,
        height: 69,
        artwork: "dark",
      },
    },
    {
      id: "wbg",
      name: "World Bank Group",
      logo: {
        src: "/partners/world-bank-group.png",
        width: 2013,
        height: 395,
        artwork: "dark",
        colour: true,
      },
    },
    {
      id: "water-forward",
      name: "Water Forward",
      logo: {
        src: "/partners/water-forward.png",
        width: 756,
        height: 240,
        artwork: "dark",
        colour: true,
        tall: true,
      },
    },
  ] as readonly PartnerConfig[],
  /**
   * The government uploader's acknowledgement, given once per submission through the upload link (PLAN v0.3
   * section 3). M11: the v2 working text from the 20 Nov test run (PLAN v0.4 0b.3), until WBG confirms it.
   * Change the text AND bump the version together: every Submission stores the version that was accepted, so
   * submissions made under v1 keep their v1 version.
   */
  uploadAcknowledgement: {
    version: "country-upload-ack-v2",
    text: "I confirm, on behalf of the government organisation I represent, consent for the uploaded project teaser(s) to be shared with the participants invited to the Water Investment Summit, through the Water Investment Projects portal.",
  },
  /**
   * M1: what a Summit or platform admin confirms when uploading a teaser for a country in the portal workspace
   * (an admin cannot consent for a government, only record that its consent was received). Terra wording, to be
   * confirmed with WBG; v2 follows the v2 uploader wording. Stored on the Submission like the uploader's
   * acknowledgement.
   */
  uploadAcknowledgementOnBehalf: {
    version: "country-upload-ack-v2-on-behalf",
    text: "I confirm that the government organisation concerned has given its consent, in writing, for this project teaser to be shared with the participants invited to the Water Investment Summit, through the Water Investment Projects portal.",
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
  logo?: {
    src: string;
    width: number;
    height: number;
    /** "light": white artwork, turned dark on the white band and grey on light pages. "dark": dark artwork, shown as it is. */
    artwork: "light" | "dark";
    /** A colour mark (WBG, Water Forward): kept in its own colours on light pages, not turned grey. */
    colour?: boolean;
    /** A mark with icons and a tagline above and below its name (Water Forward) is drawn taller, so the name reads at the size of the others. */
    tall?: boolean;
  };
};

function investorAcknowledgement(): {
  version: string;
  text: string;
} {
  const version = process.env.INVESTOR_ACK_VERSION?.trim();
  const text = process.env.INVESTOR_ACK_TEXT?.trim();
  if (version && text) return { version, text };
  // 25 Nov (Jacob Kim, confirmed by Sajid): the box shows the full terms of use (TERMS_SECTIONS) and this line is
  // what the investor ticks. The version follows the terms, so everyone accepts the new wording once.
  return {
    version: "investor-ack-terms-2026-11-25",
    text: "I have read these terms of use and accept them.",
  };
}
