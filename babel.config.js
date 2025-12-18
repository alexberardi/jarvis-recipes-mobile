module.exports = function (api) {
  const isTest = api.env('test');
  api.cache(() => process.env.NODE_ENV);
  const plugins = [];

  if (!isTest) {
    plugins.push('react-native-reanimated/plugin');
  }

  return {
    presets: ['babel-preset-expo'],
    plugins,
  };
};

