'use client';

import React from 'react';
import { motion } from 'framer-motion';
import Skeleton from './Skeleton';

type PageSkeletonProps = {
  variant?: 'shop' | 'content' | 'dashboard' | 'immersive' | 'auth';
};

function BrandLoader() {
  return (
    <motion.div
      animate={{ y: [0, -6, 0] }}
      transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
      className="relative flex h-20 w-20 items-center justify-center rounded-[1.5rem] border border-slate-200/80 bg-white p-3 shadow-sm"
    >
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
        className="absolute inset-1 rounded-[1.25rem] border border-emerald-200/70 border-t-emerald-500 border-r-sky-300"
      />
      <motion.div
        animate={{ scale: [1, 1.06, 1], opacity: [0.4, 0.8, 0.4] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute inset-2 rounded-[1rem] bg-gradient-to-br from-emerald-100 via-sky-50 to-rose-100"
      />
      <motion.img
        src="/icon.svg"
        alt="LofiMart loading"
        animate={{ scale: [1, 1.04, 1], rotate: [0, 2, -2, 0] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
        className="relative z-10 h-14 w-14 object-contain"
      />
    </motion.div>
  );
}

function HeaderBlock() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <BrandLoader />
        <div className="space-y-2">
          <Skeleton className="h-4 w-28 rounded-full" />
          <Skeleton className="h-5 w-40" />
        </div>
      </div>
      <Skeleton className="h-4 w-28 rounded-full" />
      <Skeleton className="h-10 w-full max-w-2xl" />
      <Skeleton className="h-4 w-full max-w-3xl" />
    </div>
  );
}

function CardGrid(count: number) {
  return (
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="rounded-[1.75rem] border border-slate-200/80 bg-white p-5 shadow-sm">
          <Skeleton className="h-48 w-full rounded-[1.25rem]" />
          <div className="mt-5 space-y-3">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-10 w-32 rounded-xl" />
          </div>
        </div>
      ))}
    </div>
  );
}

function DashboardGrid() {
  return (
    <>
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-[1.5rem] border border-slate-200/80 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="space-y-3">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-20" />
              </div>
              <Skeleton className="h-12 w-12 rounded-2xl" />
            </div>
          </div>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Skeleton className="h-[360px] w-full rounded-[1.75rem]" />
        <Skeleton className="h-[360px] w-full rounded-[1.75rem]" />
      </div>
    </>
  );
}

function AuthLayout() {
  return (
    <div className="mx-auto max-w-md rounded-[2rem] border border-slate-200/80 bg-white p-8 shadow-xl">
      <div className="space-y-4">
        <div className="flex justify-center">
          <BrandLoader />
        </div>
        <Skeleton className="mx-auto h-8 w-40" />
        <Skeleton className="mx-auto h-4 w-56" />
      </div>
      <div className="mt-8 space-y-4">
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
      </div>
    </div>
  );
}

export function PageSkeleton({ variant = 'content' }: PageSkeletonProps) {
  return (
    <div className="min-h-[70vh] bg-gradient-to-b from-background via-background to-secondary/20">
      <div className="mx-auto max-w-7xl px-4 py-12 md:px-6 md:py-16">
        {variant === 'auth' ? (
          <AuthLayout />
        ) : (
          <div className="space-y-10">
            <HeaderBlock />
            {variant === 'dashboard' && DashboardGrid()}
            {variant === 'immersive' && (
              <div className="grid gap-8 lg:grid-cols-[1.3fr_0.7fr]">
                <Skeleton className="h-[520px] w-full rounded-[2rem]" />
                <div className="space-y-5">
                  <Skeleton className="h-12 w-3/4" />
                  <Skeleton className="h-5 w-full" />
                  <Skeleton className="h-5 w-5/6" />
                  <Skeleton className="h-16 w-full rounded-[1.5rem]" />
                  <Skeleton className="h-16 w-full rounded-[1.5rem]" />
                  <Skeleton className="h-56 w-full rounded-[1.5rem]" />
                </div>
              </div>
            )}
            {variant === 'shop' && (
              <>
                <div className="grid gap-4 md:grid-cols-[260px_1fr]">
                  <Skeleton className="h-[520px] w-full rounded-[1.75rem]" />
                  <div className="space-y-6">
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                      {Array.from({ length: 6 }).map((_, index) => (
                        <div key={index} className="rounded-[1.5rem] border border-slate-200/80 bg-white p-4 shadow-sm">
                          <Skeleton className="h-44 w-full rounded-[1.25rem]" />
                          <div className="mt-4 space-y-3">
                            <Skeleton className="h-5 w-2/3" />
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-6 w-24" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
            {variant === 'content' && CardGrid(6)}
          </div>
        )}
      </div>
    </div>
  );
}

export default PageSkeleton;
