import { describe, expect, it } from 'vitest'
import { displayJavaType } from './displayType'

describe('bounded Java type labels', () => {
  it('keeps the class identity in the model while shortening package-qualified face text', () => {
    expect(displayJavaType('com.example.service.PersonService')).toBe('PersonService')
    expect(displayJavaType('java.util.Map<com.example.model.Person, java.lang.String[]>')).toBe('Map<Person, String[]>')
    expect(displayJavaType('com.example.Outer.Inner')).toBe('Outer.Inner')
    expect(displayJavaType('int[]')).toBe('int[]')
  })
})
