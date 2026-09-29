public class Main {
    public static void main(String[] args) {
        a();
    }

    static void a() {
        b();
    }

    static void b() {
        String name = null;
        System.out.println(name.length());
    }
}
