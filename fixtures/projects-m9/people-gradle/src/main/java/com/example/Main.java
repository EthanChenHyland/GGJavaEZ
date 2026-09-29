package com.example;

import com.google.gson.Gson;

public class Main {
    public static void main(String[] args) {
        Person person = new Person(args.length > 0 ? args[0] : "Ethan");
        System.out.println(new Gson().toJson(person));
    }
}
