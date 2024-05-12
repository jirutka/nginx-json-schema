export function sortObjProps<T extends Record<string | number, any>>(obj: T): T {
  return Object.keys(obj)
    .sort()
    .reduce((acc, key: keyof T) => {
      acc[key] = obj[key]
      return acc
    }, {} as T)
}
