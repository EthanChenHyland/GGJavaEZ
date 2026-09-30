public final class StageFour {
    private final StageFive next = new StageFive();

    public int evaluate(Node node, int iteration) {
        return next.evaluate(node, iteration);
    }
}
