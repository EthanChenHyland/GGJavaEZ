public final class StageFive {
    public int evaluate(Node node, int iteration) {
        if (iteration == 175) throw new IllegalStateException("expected audit fault");
        return node.id + iteration;
    }
}
