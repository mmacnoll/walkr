import ParkMap from "@/components/ParkMap";

export default function Home() {
  return (
    // h-dvh = full height of the visible screen, including on phones with a collapsing address bar.
    <main className="h-dvh w-full">
      <ParkMap />
    </main>
  );
}
