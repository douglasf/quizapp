import './Avatar.css';

interface AvatarProps {
  emoji: string;
  color: string;
  size?: 'sm' | 'md' | 'lg';
}

function Avatar({ emoji, color, size = 'md' }: AvatarProps) {
  const sizeMap = { sm: '1.75rem', md: '2.5rem', lg: '3.5rem' };
  const fontMap = { sm: '1rem', md: '1.4rem', lg: '2rem' };

  return (
    <span
      className={`avatar avatar--${size}`}
      style={{
        width: sizeMap[size],
        height: sizeMap[size],
        backgroundColor: color,
        fontSize: fontMap[size],
      }}
      role="img"
      aria-label="Player avatar"
    >
      {emoji}
    </span>
  );
}

export default Avatar;
