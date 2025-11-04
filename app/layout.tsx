export const metadata = {
  title: "Agentic Personal Assistant",
  description: "Local Llama-based assistant running in your browser",
};

import "./globals.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
