import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useI18n } from '../i18n/i18n';

type ButtonVariant = 'default' | 'primary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant | undefined;
  size?: ButtonSize | undefined;
  children: ReactNode;
}

export function Button({
  variant = 'default',
  size = 'md',
  className,
  type = 'button',
  children,
  ...props
}: ButtonProps) {
  const { t } = useI18n();
  const classes = ['uiButton', className].filter(Boolean).join(' ');
  const label = props['aria-label'];

  return (
    <button
      {...props}
      type={type}
      className={classes}
      data-variant={variant}
      data-size={size}
      aria-label={typeof label === 'string' ? t(label) : label}
      title={typeof props.title === 'string' ? t(props.title) : props.title}
    >
      {typeof children === 'string' ? t(children) : children}
    </button>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: 'sm' | 'md' | undefined;
  children: ReactNode;
}

export function IconButton({
  size = 'md',
  className,
  type = 'button',
  children,
  ...props
}: IconButtonProps) {
  const { t } = useI18n();
  const classes = ['uiIconButton', className].filter(Boolean).join(' ');
  const label = props['aria-label'];

  return (
    <button
      {...props}
      type={type}
      className={classes}
      data-size={size}
      aria-label={typeof label === 'string' ? t(label) : label}
      title={typeof props.title === 'string' ? t(props.title) : props.title}
    >
      {children}
    </button>
  );
}
