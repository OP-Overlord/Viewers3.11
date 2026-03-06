import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../../lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium leading-tight ring-offset-background transition-all duration-200 ease-medical focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40 disabled:saturate-50',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-sm hover:bg-primary-hover hover:shadow-md hover:shadow-primary/20 active:scale-[0.98]',
        destructive:
          'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 hover:shadow-md hover:shadow-destructive/20 active:scale-[0.98]',
        outline:
          'border-2 border-border bg-background/50 text-foreground backdrop-blur-sm hover:border-primary hover:bg-primary/10 hover:text-primary active:scale-[0.98]',
        secondary:
          'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary-hover hover:shadow-md hover:shadow-secondary/20 active:scale-[0.98]',
        ghost:
          'text-foreground hover:bg-accent hover:text-accent-foreground active:scale-[0.98]',
        link: 'text-primary underline-offset-4 hover:underline',
        success:
          'bg-success text-success-foreground shadow-sm hover:bg-success/90 hover:shadow-md hover:shadow-success/20 active:scale-[0.98]',
        warning:
          'bg-warning text-warning-foreground shadow-sm hover:bg-warning/90 hover:shadow-md hover:shadow-warning/20 active:scale-[0.98]',
        premium:
          'button-premium bg-gradient-to-br from-primary to-secondary text-primary-foreground shadow-lg hover:shadow-xl hover:shadow-primary/30 active:scale-[0.98]',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-11 rounded-md px-6 text-base',
        xl: 'h-14 rounded-lg px-8 text-lg',
        icon: 'h-9 w-9',
        'icon-sm': 'h-8 w-8',
        'icon-lg': 'h-11 w-11',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  dataCY?: string;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, dataCY, ...props }, forwardRef) => {
    const Comp = asChild ? Slot : 'button';
    const testId = dataCY || `${props.name}-btn`;

    return (
      <Comp
        data-cy={testId}
        className={cn(buttonVariants({ variant, size }), className)}
        ref={forwardRef}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
