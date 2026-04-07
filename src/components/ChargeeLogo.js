import React from 'react';
import './ChargeeLogo.css';

const publicUrl = process.env.PUBLIC_URL || '';

const ChargeeLogo = ({ className = '', size = 'medium', variant = 'full' }) => {
  const sizeClasses = {
    small: 'logo-small',
    medium: 'logo-medium',
    large: 'logo-large',
  };

  const logoClass = `chargee-logo ${sizeClasses[size]} ${className}`;

  const iconSrc = `${publicUrl}/chargee-icon.svg`;
  const wordmarkSrc = `${publicUrl}/chargee-logo-text.svg`;

  return (
    <div className={logoClass}>
      {variant === 'full' ? (
        <div className="logo-full">
          <div className="logo-icon">
            <img src={iconSrc} alt="" className="logo-svg logo-svg-icon" aria-hidden />
          </div>
          <div className="logo-wordmark">
            <img src={wordmarkSrc} alt="Chargee" className="logo-svg logo-svg-wordmark" />
          </div>
        </div>
      ) : (
        <div className="logo-icon-only">
          <img src={iconSrc} alt="Chargee" className="logo-svg" />
        </div>
      )}
    </div>
  );
};

export default ChargeeLogo;
