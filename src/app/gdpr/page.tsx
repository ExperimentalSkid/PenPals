import { permanentRedirect } from "next/navigation";

export default function GdprPage() {
  permanentRedirect("/privacy");
}
