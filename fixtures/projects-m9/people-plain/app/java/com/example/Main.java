package com.example;

public class Main {
    public static void main(String[] args) {
        Person person = new Person(args.length > 0 ? args[0] : "Ethan");
        System.out.println(person.getName());
    }
}
