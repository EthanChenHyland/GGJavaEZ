package com.example;

import com.example.model.Person;
import com.example.service.PersonService;
import com.google.gson.Gson;
import java.util.ArrayList;

public class Main {
    public static void main(String[] args) {
        PersonService service = new PersonService();
        Person person = service.create(args.length > 0 ? args[0] : "Ethan", 18);
        System.out.println(person.getName() + ":" + new Gson().toJson(person));
    }
}
