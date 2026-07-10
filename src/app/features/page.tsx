'use client';

import React from 'react';
import Navbar from '@/components/landing/Navbar';
import Superpowers from '@/components/landing/Superpowers';
import Footer from '@/components/landing/Footer';

export default function FeaturesPage() {
  return (
    <div className="min-h-screen bg-[#030303] text-white flex flex-col justify-between overflow-hidden">
      <Navbar />
      <main className="flex-grow pt-24">
        <Superpowers />
      </main>
      <Footer />
    </div>
  );
}
