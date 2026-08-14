import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import {
  LOGO_URL,
  SITE_DESCRIPTION,
  SITE_KEYWORDS,
  SITE_NAME,
  SITE_TITLE,
  SITE_URL,
} from "@/lib/site";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: SITE_KEYWORDS,
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: "technology",
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
};

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    inLanguage: "en",
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
      logo: { "@type": "ImageObject", url: LOGO_URL },
    },
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE_URL}/?q={search_term_string}`,
      },
      "query-input": {
        "@type": "PropertyValueSpecification",
        valueRequired: true,
        valueName: "search_term_string",
      },
    },
  },
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    applicationCategory: "WebApplication",
    operatingSystem: "Any",
    browserRequirements: "Requires JavaScript",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    featureList: [
      "Federated search across Hugging Face, arXiv, GitHub, Zenodo, data.gov, OpenML and Kaggle",
      "Live streaming results over SSE",
      "Transparent Reproducibility Score on every result",
      "Copy-paste loading code for every result",
      "Optional AI-assisted Discuss mode and AI Insight",
    ].join(", "),
    publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
  },
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
    logo: { "@type": "ImageObject", url: LOGO_URL },
    description: SITE_DESCRIPTION,
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "Is Cairn free to use?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes. Basic search works with no API keys and no sign-up. Optional AI features (Discuss mode and AI Insight) run on a free Groq tier and quietly stay off when no key is configured.",
        },
      },
      {
        "@type": "Question",
        name: "Which sources does Cairn search?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Cairn fans out one query to Hugging Face, arXiv, GitHub, Zenodo, data.gov, OpenML and Kaggle in parallel, then streams, deduplicates and ranks the results.",
        },
      },
      {
        "@type": "Question",
        name: "How is the Reproducibility Score calculated?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "A transparent 0-100 score weighted 20% metadata, 20% license, 35% liveness (is the page still reachable?) and 25% maintenance (how recently was it updated?). Hover any badge to see the breakdown.",
        },
      },
      {
        "@type": "Question",
        name: "Do I need a Kaggle account?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "No. Cairn uses a small shared Kaggle key by default. You can optionally connect your own account; those credentials are AES-256-GCM encrypted on your device and only ever sent to Kaggle for your own search — never stored on Cairn's server.",
        },
      },
      {
        "@type": "Question",
        name: "Does Cairn host the datasets it finds?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "No. Cairn is a search and discovery layer. Every result links to, and includes loading code for, the original provider — nothing is re-hosted.",
        },
      },
      {
        "@type": "Question",
        name: "Does Cairn track my searches?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "No. Searches are anonymous — no accounts, no analytics, and no server-side logs of your queries. Provider responses are cached locally in SQLite with a 2-hour TTL so repeat searches stay fast and respectful.",
        },
      },
    ],
  },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {jsonLd.map((schema, i) => (
          <script
            key={i}
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
          />
        ))}
        {children}
      </body>
    </html>
  );
}