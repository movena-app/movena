import type { RemixiconComponentType } from './icons';

export interface StateIconPair {
  line: RemixiconComponentType;
  fill: RemixiconComponentType;
}

interface StateIconProps {
  icons: StateIconPair;
  active: boolean;
  size?: number | string | undefined;
  className?: string | undefined;
}

/** Renders a purpose-designed line/fill pair without mutating SVG fill styles. */
export function StateIcon({ icons, active, size, className }: StateIconProps) {
  const Icon = active ? icons.fill : icons.line;
  return (
    <Icon
      {...(size !== undefined ? { size } : {})}
      {...(className !== undefined ? { className } : {})}
      aria-hidden="true"
    />
  );
}
