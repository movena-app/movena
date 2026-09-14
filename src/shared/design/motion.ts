/** Framer Motion uses seconds while CSS tokens use milliseconds. Keep their
 * values paired here so code-driven and stylesheet-driven motion stay aligned. */
export const MOTION_DURATION = {
  fast: 0.12,
  normal: 0.18,
  slow: 0.25,
  deliberate: 0.3,
  feedback: 0.8,
  loop: 1,
} as const;

export const MOTION_EASE = {
  standard: [0.16, 1, 0.3, 1] as const,
} as const;
