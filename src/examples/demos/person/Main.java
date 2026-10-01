class Person {
    String name;
    int age;

    Person(String name) {
        this.name = name;
    }

    void setAge(int age) {
        this.age = age;
    }
}

public class Main {
    public static void main(String[] args) {
        int x = 5;
        int y = x * 2;
        Person p = new Person("Ethan");
        p.setAge(18);
    }
}
