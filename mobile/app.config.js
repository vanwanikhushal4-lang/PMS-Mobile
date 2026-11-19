// A separate bundle for the seeded, loopback-only SCM service.
module.exports = ({ config }) => {
  if (process.env.PMS_IOS_VARIANT !== 'qa') return config;

  return {
    ...config,
    scheme: 'pms-qa',
    ios: {
      ...config.ios,
      bundleIdentifier: 'com.velox.scm.mobile.qa',
      infoPlist: {
        ...config.ios?.infoPlist,
        CFBundleDisplayName: 'PMS QA',
        NSAppTransportSecurity: { NSAllowsLocalNetworking: true },
        UIFileSharingEnabled: true,
        LSSupportsOpeningDocumentsInPlace: true,
      },
    },
  };
};
