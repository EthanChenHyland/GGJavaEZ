public class Main {
    public static void main(String[] args) {
        Person person = new Person(12);
        int requestedAge = 18;
        int result = Worker.update(person, requestedAge);
        System.out.println(result);
    }
}
