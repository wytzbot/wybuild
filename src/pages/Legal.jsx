import React from "react";

const CONTENT = {
  privacy: {
    label: "PRIVACY",
    title: "Privacy Policy",
    sections: [
      ["What we collect", "WyDev collects the information needed to authenticate your GitHub account, connect you to repositories you choose to use, operate the workspace, and provide billing services. We aim to collect only what is necessary for these functions."],
      ["GitHub access", "When you sign in with GitHub, WyDev uses the permissions granted during authorization to perform actions you request, such as reading repositories, editing files, and creating or updating repository content. WyDev does not claim ownership of your code."],
      ["Payments", "Payments are processed through our payment provider. WyDev does not intentionally store your full card number, CVV, or card PIN. Payment authorization data is handled through the payment flow provided by the payment processor."],
      ["Data use", "We use account and service data to operate WyDev, prevent abuse, troubleshoot failures, maintain security, and provide requested features. We do not sell your private repository content."],
      ["Your responsibility", "Keep your GitHub account and devices secure. Review the permissions shown during GitHub authorization and revoke access from GitHub when you no longer want WyDev connected."],
    ]
  },
  terms: {
    label: "LEGAL",
    title: "Terms of Service",
    sections: [
      ["Using WyDev", "WyDev is a developer workspace that helps you work with GitHub repositories. You are responsible for the repositories, code, credentials, and content you access or modify through the service."],
      ["Acceptable use", "Do not use WyDev to violate GitHub rules, applicable law, intellectual-property rights, privacy rights, or the rights of other users. Do not attempt to bypass security controls, abuse service limits, or interfere with the service."],
      ["GitHub and third parties", "GitHub remains the source of truth for your repositories. GitHub, payment providers, and other third-party services are governed by their own terms and policies."],
      ["Subscriptions", "Pro features require an active subscription. Pricing, included features, renewal terms, and availability may change with reasonable notice. If a payment fails, access to Pro features may be restricted until the subscription is restored."],
      ["No guarantee", "WyDev is provided to help with development workflows, but you should keep appropriate backups and review changes before committing or pushing important code. We are not responsible for loss caused by your own code, repository configuration, or third-party service outages."],
    ]
  },
  about: {
    label: "WYDEV",
    title: "About WyDev",
    sections: [
      ["Built for developers", "WyDev is a focused mobile-friendly developer workspace built around GitHub. It brings repository browsing, file editing, changes, search, commits, and project workflows into one streamlined interface."],
      ["GitHub-first", "Your repositories stay on GitHub. WyDev is designed as a productivity layer on top of GitHub rather than a replacement for Git hosting."],
      ["Simple by design", "The goal is fast access to the tools developers use most, without turning the interface into a social feed or an unnecessarily complicated IDE."],
      ["Support", "For help with a specific workflow, use the Help section inside WyDev and check the error message shown by the app before retrying an operation."],
    ]
  }
};

export default function LegalPage({ type }) {
  const data = CONTENT[type] || CONTENT.about;
  return (
    <div className="page legalPage">
      <header><div><span className="eyebrow">{data.label}</span><h1>{data.title}</h1></div></header>
      <section className="panel legalPanel">
        {data.sections.map(([heading, body]) => (
          <details className="legalSection" key={heading} open={type === "about"}>
            <summary>{heading}</summary>
            <p>{body}</p>
          </details>
        ))}
        <p className="muted legalNote">Last updated: August 27, 2026. These pages describe the current WyDev product and may be updated as the service evolves.</p>
      </section>
    </div>
  );
}
