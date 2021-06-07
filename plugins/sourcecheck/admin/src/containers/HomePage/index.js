/*
 *
 * HomePage
 *
 */
import './index.css';
import React, { memo } from 'react';
// import PropTypes from 'prop-types';
import pluginId from '../../pluginId';

const HomePage = () => {
  return (
    <div className="sc-container">
      <h1>SourceCheck SSI Authentication Plugin</h1>
      <p>This plugin doesn't require any custom configuration at this version</p>
    </div>
  );
};

export default memo(HomePage);
