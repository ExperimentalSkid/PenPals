import Image from "next/image";

type BrandLogoProps = {
  variant?: "wordmark" | "logo" | "icon";
  className?: string;
  priority?: boolean;
  loading?: "eager" | "lazy";
};

const assets = {
  wordmark: {
    src: "/assets/brand/wordmark/wordmark-primary.svg",
    width: 1082,
    height: 228,
    alt: "pen-pals.net",
  },
  logo: {
    src: "/assets/brand/logo/logo-primary.svg",
    width: 1102,
    height: 822,
    alt: "pen-pals.net",
  },
  icon: {
    src: "/assets/brand/icon/icon-primary.svg",
    width: 805,
    height: 590,
    alt: "pen-pals.net",
  },
} as const;

export default function BrandLogo({ variant = "wordmark", className, priority = false, loading }: BrandLogoProps) {
  const asset = assets[variant];
  return <Image src={asset.src} width={asset.width} height={asset.height} alt={asset.alt} priority={priority} loading={loading} className={className} />;
}
