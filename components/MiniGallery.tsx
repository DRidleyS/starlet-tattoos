"use client";
import Image from "next/image";
import { motion } from "framer-motion";

const galleryImages = [
  // Replace with real tattoo images
  { src: "/tattoo1.jpg", alt: "Tattoo 1" },
  { src: "/tattoo2.jpg", alt: "Tattoo 2" },
  { src: "/tattoo3.jpg", alt: "Tattoo 3" },
  { src: "/tattoo4.jpg", alt: "Tattoo 4" },
  { src: "/tattoo5.jpg", alt: "Tattoo 5" },
  { src: "/tattoo6.jpg", alt: "Tattoo 6" },
];

export default function MiniGallery() {
  return (
    <div className="flex flex-wrap justify-center gap-4 mt-8">
      {galleryImages.map((img, i) => (
        <motion.div
          key={img.src}
          whileHover={{ scale: 1.08 }}
          className="w-24 h-24 rounded-full overflow-hidden border-2 border-neutral shadow-sm bg-white flex items-center justify-center"
        >
          <Image src={img.src} alt={img.alt} width={96} height={96} />
        </motion.div>
      ))}
    </div>
  );
}
