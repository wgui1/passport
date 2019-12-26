const defaultKey = 'default';

export function memoize(fn: Function) {
  let cache = {};
  return (...args) => {
    let n = JSON.stringify(args) || defaultKey;
    if (n in cache) {
      return cache[n];
    } else {
      let result = fn(...(n === defaultKey ? [undefined] : args));
      cache[n] = result;
      return result;
    }
  };
}
