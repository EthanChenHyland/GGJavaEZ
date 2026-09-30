public final class StageThree {
    private final StageFour next = new StageFour();

    public int evaluate(Node node, int iteration) {
        return next.evaluate(node, iteration);
    }
}
