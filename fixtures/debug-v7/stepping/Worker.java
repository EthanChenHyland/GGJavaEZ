public class Worker {
    public static int update(Person person, int requestedAge) {
        person.setAge(requestedAge);
        int[] ages = {person.getAge(), requestedAge};
        int result = read(ages, 0);
        return result;
    }

    static int read(int[] ages, int index) {
        int result = ages[index];
        return result;
    }
}
