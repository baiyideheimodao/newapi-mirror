import React from 'react';
import { Tag as SemiTag } from '@douyinfe/semi-ui';

export const Icon = React.forwardRef(
  ({ icon: IconComponent, size, color, style, ...rest }, ref) => {
    const fontSize =
      typeof size === 'number'
        ? size
        : typeof size?.fontSize === 'number'
          ? size.fontSize
          : undefined;

    return (
      <span
        ref={ref}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color,
          ...style,
        }}
        {...rest}
      >
        {IconComponent ? <IconComponent size={fontSize} color={color} /> : null}
      </span>
    );
  },
);

Icon.displayName = 'LobeHubIconShim';

export const Tag = React.forwardRef(({ icon, children, ...rest }, ref) => {
  return (
    <SemiTag avatar={icon} ref={ref} {...rest}>
      {children}
    </SemiTag>
  );
});

Tag.displayName = 'LobeHubTagShim';
