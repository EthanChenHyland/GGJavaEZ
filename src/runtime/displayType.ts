/** Keep the runtime's full Java type; shorten only labels on bounded faces. */
export function displayJavaType(javaType: string): string {
  return javaType.replace(/\b(?:[a-z_$][\w$]*\.)+([A-Z_$][\w$]*)/g, '$1')
}
