import './globals.css';

export const metadata = {
  title: 'DOH-BCHD Leave Monitoring',
  description: 'Central leave application and approval system - DOH Bicol Center for Health Development',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
