public class BranchMain {
    static int lower(int operand) { return operand + 1; }
    static int upper(int operand) { return operand + 2; }
    static int fork(int seed) { return lower(seed) + upper(seed); }
    public static void main(String[] args) {
        int rounds = args.length == 0 ? 450 : 2400;
        int checksum = 0;
        for (int index = 0; index < rounds; index++) checksum += fork(index);
        System.out.println("CALLS " + (rounds * 3) + " CHECK " + checksum);
    }
}
