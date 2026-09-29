package com.example.service;

import com.example.model.Person;

public class PersonService {
    public Person create(String name, int age) {
        Person person = new Person(name);
        person.setAge(age);
        return person;
    }
}
