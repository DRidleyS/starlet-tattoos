import Image from "next/image";
import Link from "next/link";
import MiniGallery from "../components/MiniGallery";
import HoneycombGallery from "../components/HoneycombGallery";
import VineTopFrame from "../components/VineTopFrame";
import VineMainDivider from "../components/VineMainDivider";
import BookNowLauncher from "../components/BookNowLauncher";

export default function Home() {
  return (
    <>
      <main className="flex flex-col items-center justify-start bg-white px-4">
        <div className="w-full flex flex-col items-center justify-center h-screen relative">
          <VineTopFrame />
          <Image
            src="/starletlogo.jpg"
            alt="Starlet Tattoos Logo"
            width={320}
            height={120}
            priority
            className="mb-6 mt-6 sm:mt-12"
          />
          <h1 className="text-4xl font-serif text-ink text-center mb-2">
            Starlet Tattoos
          </h1>
          <p className="text-lg text-ink text-center">
            Fine line and custom tattoo studio in Santa Clarita, CA
          </p>
          <br></br>
          {/* Book now button (intake flow) */}
          <div className="flex gap-4 mb-8">
            <BookNowLauncher />
          </div>
          {/* Main divider (place where divider belongs in page flow) */}
          <div className="w-full flex justify-center mt-8">
            <VineMainDivider width={1200} centerY={110} />
          </div>
        </div>
        {/* Next sections: intro, featured artist, mini gallery, etc. */}
        {/* Mini gallery preview */}
        <section className="w-full flex flex-col items-center mt-8">
          <div className="w-full max-w-5xl">
            <HoneycombGallery
              items={[
                { paper: "/tat1.png", onBody: "/tat1.png" },
                { paper: "/tat2.png", onBody: "/tat2.png" },
                { paper: "/tat3.png", onBody: "/tat3.png" },
                { paper: "/tat4.png", onBody: "/tat4.png" },
                { paper: "/tat5.png", onBody: "/tat5.png" },
                { paper: "/tat6.png", onBody: "/tat6.png" },
                { paper: "/tat7.png", onBody: "/tat7.png" },
                { paper: "/tat8.png", onBody: "/tat8.png" },
                { paper: "/tat9.png", onBody: "/tat9.png" },
                { paper: "/tat10.png", onBody: "/tat10.png" },
                { paper: "/tat11.png", onBody: "/tat11.png" },
                { paper: "/tat12.png", onBody: "/tat12.png" },
                { paper: "/tat13.png", onBody: "/tat13.png" },
                { paper: "/tat14.PNG", onBody: "/tat14.PNG" },
                { paper: "/tat15.png", onBody: "/tat15.png" },
                { paper: "/tat16.png", onBody: "/tat16.png" },
              ]}
            />
          </div>
        </section>
      </main>
    </>
  );
}
